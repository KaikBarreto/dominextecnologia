import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowLeft, ArrowRight, Loader2, Check,
  Phone, Mail, Building2, User, Lock,
  MapPin, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { phoneMask, cepMask } from '@/utils/masks';
import { cn } from '@/lib/utils';
import { captureUtmParams, getLeadOriginLabel } from '@/lib/whatsapp';
import logoWhite from '@/assets/logo-horizontal-verde.png';
import DarkVeil from '@/components/ui/DarkVeil';
import { SystemFooter } from '@/components/layout/SystemFooter';
import { PasswordInput } from '@/components/PasswordInput';
import { PasswordStrengthIndicator, isPasswordStrong } from '@/components/PasswordStrengthIndicator';
import { StepTransition } from '@/components/ui/step-transition';
import { getSelectableSegments } from '@/utils/companySegments';
import { ORIGIN_OPTIONS } from '@/utils/companyOrigins';
import { SelectableCardGrid } from '@/components/registration/SelectableCardGrid';

interface RegistrationFormData {
  company_name: string;
  contact_name: string;
  company_email: string;
  company_phone: string;
  company_cnpj?: string;
  password: string;
  confirm_password: string;
}

// Ordem das etapas: Dados (1) → Segmento (2) → Origem (3) → Acesso (4) → Sucesso.
const STEP_LABELS = ['Dados', 'Segmento', 'Origem', 'Acesso', 'Sucesso'];

interface AddressData {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  codigo_ibge: string;
}

const EMPTY_ADDRESS: AddressData = {
  cep: '', logradouro: '', numero: '', complemento: '',
  bairro: '', cidade: '', uf: '', codigo_ibge: '',
};

// Regex de e-mail — mesma do validador do react-hook-form abaixo.
const EMAIL_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export default function Registration() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [selectedOrigin, setSelectedOrigin] = useState('');
  // Segmento de atuação — obrigatório no cadastro da empresa. Só a Dominex
  // (painel admin) pode alterar depois; o tenant não edita nas Configurações.
  const [companySegment, setCompanySegment] = useState('');
  // Erro de e-mail já em uso — exibido inline abaixo do input na etapa Dados.
  const [emailError, setEmailError] = useState('');
  // Checagem em tempo real de e-mail já cadastrado (RPC anon-safe).
  const [emailChecking, setEmailChecking] = useState(false);
  // Trava o avanço da etapa Dados quando o e-mail está confirmado como em uso.
  const [emailTaken, setEmailTaken] = useState(false);
  const emailCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailCheckSeq = useRef(0);
  // Endereço estruturado — OPCIONAL, accordion fechado por padrão na etapa Dados.
  const [addressOpen, setAddressOpen] = useState(false);
  const [addressData, setAddressData] = useState<AddressData>(EMPTY_ADDRESS);
  const [cepLoading, setCepLoading] = useState(false);

  // Autofill por CEP via ViaCEP. Opcional: erro não bloqueia nada, só não preenche.
  const handleCepLookup = async (rawCep: string) => {
    const digits = rawCep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!res.ok) throw new Error('cep');
      const data = await res.json();
      if (data?.erro) {
        toast({ variant: 'destructive', title: 'CEP não encontrado', description: 'Confira o número e tente de novo.' });
        return;
      }
      setAddressData((prev) => ({
        ...prev,
        logradouro: data.logradouro || prev.logradouro,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
        uf: data.uf || prev.uf,
        codigo_ibge: data.ibge || prev.codigo_ibge,
      }));
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível buscar o CEP', description: 'Preencha o endereço manualmente.' });
    } finally {
      setCepLoading(false);
    }
  };

  // Checa na RPC anon-safe se o e-mail já está cadastrado. Só roda com formato
  // válido. Falha de rede é silenciosa (não bloqueia o fluxo). Usa um seq pra
  // descartar respostas fora de ordem (debounce + blur podem se sobrepor).
  // Retorna `true` quando o e-mail está EM USO (pra trava síncrona no submit).
  const checkEmailAvailable = async (rawEmail: string): Promise<boolean> => {
    const email = (rawEmail || '').trim();
    if (!email || !EMAIL_REGEX.test(email)) {
      setEmailChecking(false);
      setEmailTaken(false);
      return false;
    }
    const seq = ++emailCheckSeq.current;
    setEmailChecking(true);
    try {
      const { data, error } = await supabase.rpc('check_email_available', { _email: email });
      if (seq !== emailCheckSeq.current) return false; // resposta obsoleta
      if (error) { setEmailTaken(false); return false; } // rede/RPC falhou → não trava
      if (data === false) {
        setEmailTaken(true);
        setEmailError('Este e-mail já está em uso. Faça login ou use outro e-mail.');
        return true;
      }
      setEmailTaken(false);
      setEmailError('');
      return false;
    } catch {
      if (seq === emailCheckSeq.current) setEmailTaken(false);
      return false;
    } finally {
      if (seq === emailCheckSeq.current) setEmailChecking(false);
    }
  };

  // Captura utm_* cedo — cobre anúncio que aponta direto pro /cadastro e
  // persiste em sessionStorage antes de qualquer navegação interna.
  useEffect(() => {
    captureUtmParams(window.location.search);
  }, []);

  // Origem do lead — prioridade:
  // 1. `origem` explícita da URL que NÃO seja o genérico 'Site' (links de venda/indicação);
  // 2. UTM capturada (utm_source) → label amigável ("Instagram", "ChatGPT", ...);
  // 3. `origem=Site` genérico das CTAs da LP.
  // Origem vinda da URL: truthy SÓ quando há param/UTM real. Sem isso é null
  // → a etapa Origem APARECE no cadastro normal (`/cadastro` puro).
  const explicitOrigin = searchParams.get('origem');
  // Segmento vindo de uma página de nicho do site (?segmento=cftv, etc.).
  // Só é aceito se for um segmento SELECIONÁVEL (os 9 do site + 'outro'); valores
  // inválidos/legados são ignorados. Pré-seleciona o card na etapa Segmento sem
  // auto-avançar — a pessoa confirma no Continuar.
  const segmentFromUrl = searchParams.get('segmento');
  const refCode = searchParams.get('ref'); // referral_code de indicação
  const originFromUrl =
    (explicitOrigin && explicitOrigin !== 'Site' ? explicitOrigin : null) ??
    getLeadOriginLabel() ??
    (explicitOrigin || null);
  // Sales-link params
  const linkType = searchParams.get('tipo'); // 'teste' | 'venda'
  const lockedPlan = searchParams.get('plano') || null;
  const isLocked = searchParams.get('bloqueado') === '1';
  const lockedPrice = searchParams.get('preco');
  const lockedCycle = (searchParams.get('ciclo') as 'monthly' | 'yearly' | null) || null;
  const promoMonths = searchParams.get('meses_promo');
  const trialDaysParam = searchParams.get('dias');
  const referrer = searchParams.get('vendedor'); // referral_code do closer
  const sdrReferrer = searchParams.get('sdr'); // referral_code do SDR (opcional)
  // Pula a etapa Origem quando a origem veio de algum param de URL
  // (origem explícita/UTM, indicação `ref` ou vendedor).
  const skipOriginStep = !!(originFromUrl || refCode || referrer);
  const isSale = linkType === 'venda';
  // Plano personalizado: módulos à la carte + máx. usuários vindos do link
  const lockedModulesParam = searchParams.get('modulos');
  const lockedUsersParam = searchParams.get('usuarios');
  const lockedModuleCodes = lockedModulesParam
    ? lockedModulesParam.split(',').map(m => m.trim()).filter(Boolean)
    : null;
  const isCustomPlan = isLocked && lockedPlan === 'personalizado';

  useEffect(() => {
    // Sem origem na URL → '' (usuário escolhe na etapa Origem). Nunca null no state string.
    setSelectedOrigin(originFromUrl || '');
  }, [originFromUrl]);

  // Pré-seleciona o segmento quando vem de uma página de nicho (?segmento=...).
  // Validamos contra getSelectableSegments() pra aceitar só os 9 do site + 'outro'
  // (ignora valores inválidos/legados). IMPORTANTE: só setamos o state (card fica
  // marcado) — NÃO chamamos advanceFromSegment/handleSegmentSelect, pra não disparar
  // o auto-avanço do card. A pessoa continua vendo a etapa Segmento e confirma no
  // botão Continuar. Pré-seleção ≠ clique simulado.
  useEffect(() => {
    if (!segmentFromUrl) return;
    const isSelectable = getSelectableSegments().some(s => s.value === segmentFromUrl);
    if (isSelectable) setCompanySegment(segmentFromUrl);
  }, [segmentFromUrl]);

  const { register, handleSubmit, watch, formState: { errors }, trigger } = useForm<RegistrationFormData>();
  const emailValue = watch('company_email');
  const passwordValue = watch('password') || '';
  const confirmValue = watch('confirm_password') || '';

  // Catálogo dos módulos do plano personalizado (leitura pública) — pro resumo
  const { data: lockedModuleInfo = [] } = useQuery({
    queryKey: ['registration-locked-modules', lockedModulesParam],
    enabled: isCustomPlan && !!lockedModuleCodes?.length,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_modules')
        .select('code, name, price')
        .eq('is_active', true)
        .in('code', lockedModuleCodes!);
      if (error) throw error;
      return data || [];
    },
  });

  const lockedModulesTotal = lockedModuleInfo.reduce((acc, m) => acc + (Number(m.price) || 0), 0);
  const customPlanPrice = lockedPrice ? parseFloat(lockedPrice) : lockedModulesTotal;

  const registerMutation = useMutation({
    mutationFn: async (data: RegistrationFormData) => {
      // Endereço opcional → formata só se o usuário preencheu (espelha o Eco).
      const formattedAddress = addressData.logradouro
        ? `${addressData.logradouro}${addressData.numero ? `, ${addressData.numero}` : ''}${addressData.complemento ? ` - ${addressData.complemento}` : ''}${addressData.bairro ? ` - ${addressData.bairro}` : ''}${addressData.cidade ? ` - ${addressData.cidade}` : ''}${addressData.uf ? `/${addressData.uf}` : ''}${addressData.cep ? ` - CEP: ${addressData.cep}` : ''}`
        : '';
      const { data: result, error } = await supabase.functions.invoke('self-register', {
        body: {
          company_name: data.company_name,
          company_cnpj: data.company_cnpj,
          company_email: data.company_email,
          company_phone: data.company_phone,
          contact_name: data.contact_name,
          password: data.password,
          company_address: formattedAddress || null,
          origin: selectedOrigin || null,
          segment: companySegment || null,
          // Link/affiliate params
          link_type: linkType || null,
          locked_plan: lockedPlan,
          is_locked: isLocked,
          locked_price: lockedPrice ? parseFloat(lockedPrice) : null,
          billing_cycle: lockedCycle,
          promo_months: promoMonths ? parseInt(promoMonths) : null,
          trial_days: trialDaysParam ? parseInt(trialDaysParam) : null,
          referral_code: referrer || null,
          sdr_referral_code: sdrReferrer || null,
          // Plano personalizado (módulos à la carte do link)
          modules: isCustomPlan && lockedModuleCodes?.length ? lockedModuleCodes : null,
          max_users: lockedUsersParam ? parseInt(lockedUsersParam) : null,
        },
      });

      if (result?.error) throw new Error(result.error);
      if (error) {
        let msg = 'Erro ao realizar cadastro';
        // FunctionsHttpError: `error.context` é a Response da edge (não { body }).
        // Lê o JSON de erro pra extrair a mensagem real (ex.: e-mail duplicado).
        const ctx = (error as any)?.context;
        try {
          if (ctx && typeof ctx.json === 'function') {
            const parsed = await ctx.clone().json();
            if (parsed?.error) msg = parsed.error;
          } else {
            const body = ctx?.body;
            const parsed = typeof body === 'string' ? JSON.parse(body) : body;
            if (parsed?.error) msg = parsed.error;
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      if (!result?.success) throw new Error('Erro inesperado ao realizar cadastro');
      return result;
    },
    onSuccess: async (_, variables) => {
      toast({
        title: 'Cadastro realizado!',
        description: isSale ? 'Redirecionando para o pagamento...' : 'Redirecionando...',
      });
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: variables.company_email,
        password: variables.password,
      });
      if (loginError) {
        navigate('/login');
      } else {
        // Sales link → go straight to checkout to finalize payment
        const target = isSale ? '/checkout' : '/dashboard';
        setTimeout(() => navigate(target), 500);
      }
    },
    onError: (error: any) => {
      const msg = error?.message || 'Erro ao realizar cadastro';
      if (msg.includes('já está cadastrado') || msg.includes('already registered')) {
        // E-mail já em uso → leva o usuário de volta à etapa Dados e mostra
        // a mensagem vermelha inline abaixo do input de e-mail.
        setEmailError('Este e-mail já está em uso. Faça login ou use outro e-mail.');
        setStep(1);
        toast({ variant: 'destructive', title: 'Email já cadastrado', description: 'Faça login ou use outro email.' });
      } else {
        toast({ variant: 'destructive', title: 'Erro no cadastro', description: msg });
      }
    },
  });

  // Avança a partir do Segmento (step 2). Recebe o valor escolhido pra cobrir
  // tanto o auto-avançar do card quanto o botão Continuar (state pode não ter
  // propagado no mesmo tick do clique). Pula Origem quando veio de URL.
  const advanceFromSegment = (segment: string) => {
    if (!segment) {
      toast({ variant: 'destructive', title: 'Selecione o segmento', description: 'Informe o segmento de atuação da sua empresa.' });
      return;
    }
    setStep(skipOriginStep ? 4 : 3);
  };

  // Avança a partir da Origem (step 3) → Acesso (step 4).
  const advanceFromOrigin = (origin: string) => {
    if (!origin) {
      toast({ variant: 'destructive', title: 'Selecione uma origem', description: 'Como você nos conheceu?' });
      return;
    }
    setStep(4);
  };

  // Clique no card de Segmento: seta o valor E avança automaticamente.
  const handleSegmentSelect = (value: string) => {
    setCompanySegment(value);
    advanceFromSegment(value);
  };

  // Clique no card de Origem: seta o valor E avança automaticamente.
  const handleOriginSelect = (value: string) => {
    setSelectedOrigin(value);
    advanceFromOrigin(value);
  };

  const onSubmit = async (data: RegistrationFormData) => {
    if (step === 1) {
      // Etapa Dados — valida campos obrigatórios. Endereço é opcional (não trava).
      const valid = await trigger(['company_name', 'contact_name', 'company_email', 'company_phone']);
      if (!valid) return;
      // Bloqueia o avanço com e-mail já em uso. Resolve a checagem agora (await)
      // pra cobrir o caso de o debounce não ter rodado / ainda estar em voo.
      if (emailCheckTimer.current) { clearTimeout(emailCheckTimer.current); emailCheckTimer.current = null; }
      const taken = emailTaken || (await checkEmailAvailable(data.company_email));
      if (taken) {
        setEmailError('Este e-mail já está em uso. Faça login ou use outro e-mail.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      advanceFromSegment(companySegment);
    } else if (step === 3) {
      advanceFromOrigin(selectedOrigin);
    } else if (step === 4) {
      const valid = await trigger(['password', 'confirm_password']);
      if (!valid) return;
      if (data.password !== data.confirm_password) {
        toast({ variant: 'destructive', title: 'Senhas não coincidem' });
        return;
      }
      if (!isPasswordStrong(data.password)) {
        toast({ variant: 'destructive', title: 'Senha fraca', description: 'Use ao menos 8 caracteres com letras maiúsculas, minúsculas, números e/ou caracteres especiais.' });
        return;
      }
      registerMutation.mutate(data);
    }
  };

  const handlePrevious = () => {
    if (step === 4 && skipOriginStep) setStep(2);
    else if (step > 1) setStep(step - 1);
  };

  // Dynamic step labels — quando a origem vem da URL, a etapa Origem some.
  const displayLabels = skipOriginStep
    ? ['Dados', 'Segmento', 'Acesso', 'Sucesso']
    : STEP_LABELS;
  const displayStep = skipOriginStep && step >= 4 ? step - 1 : step;

  return (
    <div className="relative min-h-[100dvh] flex flex-col sm:items-center sm:justify-center sm:p-4 overflow-hidden">
      <div className="fixed inset-0 z-0">
        <DarkVeil hueShift={53} speed={0.5} />
      </div>

      <div className="relative z-10 w-full max-w-2xl lg:max-w-4xl flex flex-col flex-1 sm:flex-initial">
        {/* Logo — desktop fica no topo, mobile fica flutuando sobre o veil */}
        <div className="flex flex-col items-center px-6 pt-[max(env(safe-area-inset-top),2rem)] pb-6 sm:p-0 sm:mb-8">
          <img src={logoWhite} alt="Dominex" className="h-14 w-auto mb-2" />
          <p className="text-white/80 text-xs sm:text-sm tracking-wider sm:tracking-normal">Domine a execução do seu negócio.</p>
        </div>

        <Card className="border-0 border-t border-white/10 sm:border sm:border-white/15 bg-black/30 sm:bg-black/40 backdrop-blur-2xl sm:backdrop-blur-xl shadow-2xl rounded-t-[28px] sm:rounded-xl flex-1 sm:flex-initial animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:fade-in duration-500 ease-out">
          <div className="mx-auto h-1 w-10 rounded-full bg-white/30 mt-3 mb-1 sm:hidden" />
          <CardContent className="p-6 xl:p-8 pb-[max(env(safe-area-inset-bottom),3rem)] sm:pb-6">
            <div className="space-y-6">

              {/* Header */}
              <div className="text-center space-y-2">
                <h1 className="text-xl font-medium text-white uppercase tracking-[0.15em]">
                  Cadastro
                </h1>
                <p className="text-white/50 text-xs uppercase tracking-[0.1em]">
                  Teste grátis por 14 dias · Sem compromisso · Acesso total
                </p>
              </div>

              {/* Step Indicators — no mobile estreita um pouco (conectores menores)
                  pra afastar os passos das bordas laterais. */}
              <div className="flex items-start justify-center px-5 sm:px-0">
                {displayLabels.map((label, i) => {
                  const s = i + 1;
                  return (
                    <div key={s} className="flex items-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <div className={cn(
                          'w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                          s < displayStep && 'bg-primary text-primary-foreground',
                          s === displayStep && 'bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-transparent',
                          s > displayStep && 'bg-white/10 text-white/40'
                        )}>
                          {s < displayStep ? <Check className="h-4 w-4" /> : s}
                        </div>
                        <span className={cn(
                          'text-[10px] whitespace-nowrap uppercase tracking-widest',
                          s <= displayStep ? 'text-primary font-medium' : 'text-white/40'
                        )}>
                          {label}
                        </span>
                      </div>
                      {s < displayLabels.length && (
                        <div className={cn(
                          'w-4 sm:w-8 h-0.5 mx-0.5 sm:mx-1 mt-3.5 sm:mt-4 self-start',
                          s < displayStep ? 'bg-primary' : 'bg-white/15'
                        )} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Resumo do plano personalizado bloqueado pelo link */}
              {isCustomPlan && lockedModuleInfo.length > 0 && step <= 4 && (
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-2">
                  <p className="text-sm text-primary font-medium">Seu plano personalizado</p>
                  <ul className="text-xs text-white/70 space-y-1">
                    {lockedModuleInfo.map((m) => (
                      <li key={m.code} className="flex items-center gap-1.5">
                        <Check className="h-3 w-3 text-primary shrink-0" />{m.name}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-white/50 pt-2 border-t border-white/10">
                    Valor mensal: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(customPlanPrice)}
                    {lockedPrice && promoMonths ? ` pelos primeiros ${promoMonths} meses` : ''}
                  </p>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <StepTransition stepKey={String(step)} index={step} className="space-y-4">
                {/* Step 1: Company Data */}
                {step === 1 && (
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs font-normal uppercase tracking-[0.1em] text-white/60">Nome da Empresa*</Label>
                      <div className="relative mt-1">
                        <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                        <Input
                          {...register('company_name', { required: 'Nome da empresa é obrigatório' })}
                          placeholder="Ex: Minha Empresa Ltda"
                          className="pl-10 bg-primary/[0.08] border-primary/30 text-white placeholder:text-white/50 focus:border-primary"
                        />
                      </div>
                      {errors.company_name && <p className="text-sm text-destructive mt-1">{errors.company_name.message}</p>}
                    </div>

                    <div>
                      <Label className="text-xs font-normal uppercase tracking-[0.1em] text-white/60">Seu Nome Completo*</Label>
                      <div className="relative mt-1">
                        <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                        <Input
                          {...register('contact_name', { required: 'Nome é obrigatório' })}
                          placeholder="Ex: João Silva"
                          className="pl-10 bg-primary/[0.08] border-primary/30 text-white placeholder:text-white/50 focus:border-primary"
                        />
                      </div>
                      {errors.contact_name && <p className="text-sm text-destructive mt-1">{errors.contact_name.message}</p>}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs font-normal uppercase tracking-[0.1em] text-white/60">Email*</Label>
                        <div className="relative mt-1">
                          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                          <Input
                            type="email"
                            {...register('company_email', {
                              required: 'Email é obrigatório',
                              pattern: { value: EMAIL_REGEX, message: 'Email inválido' },
                              // Ao editar: limpa o erro/trava e agenda checagem com debounce
                              // de ~500ms quando o e-mail tem formato válido.
                              onChange: (e) => {
                                if (emailError) setEmailError('');
                                if (emailTaken) setEmailTaken(false);
                                const value = e.target.value;
                                if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
                                if (EMAIL_REGEX.test((value || '').trim())) {
                                  emailCheckTimer.current = setTimeout(() => checkEmailAvailable(value), 500);
                                } else {
                                  setEmailChecking(false);
                                }
                              },
                              // Ao sair do campo: checa na hora (cancela o debounce pendente).
                              onBlur: (e) => {
                                if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
                                checkEmailAvailable(e.target.value);
                              },
                            })}
                            placeholder="email@exemplo.com"
                            aria-invalid={emailError ? true : undefined}
                            aria-describedby={emailError ? 'company-email-error' : undefined}
                            className={cn(
                              'pl-10 pr-9 bg-primary/[0.08] border-primary/30 text-white placeholder:text-white/50 focus:border-primary',
                              emailError && 'border-destructive focus:border-destructive'
                            )}
                          />
                          {emailChecking && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/50" />}
                        </div>
                        {errors.company_email && <p className="text-sm text-destructive mt-1">{errors.company_email.message}</p>}
                        {emailChecking && !emailError && <p className="text-xs text-white/50 mt-1">Verificando disponibilidade…</p>}
                        {emailError && <p id="company-email-error" className="text-xs text-destructive mt-1">{emailError}</p>}
                      </div>

                      <div>
                        <Label className="text-xs font-normal uppercase tracking-[0.1em] text-white/60">Telefone*</Label>
                        <div className="relative mt-1">
                          <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                          <Input
                            {...register('company_phone', {
                              required: 'Telefone é obrigatório',
                              onChange: (e) => { e.target.value = phoneMask(e.target.value); },
                            })}
                            placeholder="(21) 98765-4321"
                            maxLength={15}
                            className="pl-10 bg-primary/[0.08] border-primary/30 text-white placeholder:text-white/50 focus:border-primary"
                          />
                        </div>
                        {errors.company_phone && <p className="text-sm text-destructive mt-1">{errors.company_phone.message}</p>}
                      </div>
                    </div>

                    {/* Endereço — opcional, accordion fechado por padrão */}
                    <Collapsible open={addressOpen} onOpenChange={setAddressOpen}>
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3.5 py-3 text-left transition-colors hover:border-white/20 hover:bg-white/10"
                        >
                          <span className="flex items-center gap-2 text-sm text-white/80">
                            <MapPin className="h-4 w-4 text-white/50" />
                            Endereço da empresa
                            <span className="text-[11px] text-white/40">(opcional)</span>
                          </span>
                          <ChevronDown className={cn('h-4 w-4 text-white/50 transition-transform', addressOpen && 'rotate-180')} />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="overflow-hidden">
                        <div className="space-y-4 pt-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="sm:col-span-1">
                              <Label className="text-xs font-normal uppercase tracking-[0.1em] text-white/60">CEP</Label>
                              <div className="relative mt-1">
                                <Input
                                  inputMode="numeric"
                                  value={addressData.cep}
                                  onChange={(e) => {
                                    const masked = cepMask(e.target.value);
                                    setAddressData((prev) => ({ ...prev, cep: masked }));
                                    if (masked.replace(/\D/g, '').length === 8) handleCepLookup(masked);
                                  }}
                                  onBlur={(e) => handleCepLookup(e.target.value)}
                                  placeholder="00000-000"
                                  maxLength={9}
                                  className="bg-primary/[0.08] border-primary/30 text-white placeholder:text-white/50 focus:border-primary pr-9"
                                />
                                {cepLoading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/50" />}
                              </div>
                            </div>
                            <div className="sm:col-span-2">
                              <Label className="text-xs font-normal uppercase tracking-[0.1em] text-white/60">Logradouro</Label>
                              <Input
                                value={addressData.logradouro}
                                onChange={(e) => setAddressData((prev) => ({ ...prev, logradouro: e.target.value }))}
                                placeholder="Rua, avenida..."
                                className="mt-1 bg-primary/[0.08] border-primary/30 text-white placeholder:text-white/50 focus:border-primary"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                              <Label className="text-xs font-normal uppercase tracking-[0.1em] text-white/60">Número</Label>
                              <Input
                                value={addressData.numero}
                                onChange={(e) => setAddressData((prev) => ({ ...prev, numero: e.target.value }))}
                                placeholder="123"
                                className="mt-1 bg-primary/[0.08] border-primary/30 text-white placeholder:text-white/50 focus:border-primary"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <Label className="text-xs font-normal uppercase tracking-[0.1em] text-white/60">Complemento</Label>
                              <Input
                                value={addressData.complemento}
                                onChange={(e) => setAddressData((prev) => ({ ...prev, complemento: e.target.value }))}
                                placeholder="Sala, bloco..."
                                className="mt-1 bg-primary/[0.08] border-primary/30 text-white placeholder:text-white/50 focus:border-primary"
                              />
                            </div>
                          </div>

                          <div>
                            <Label className="text-xs font-normal uppercase tracking-[0.1em] text-white/60">Bairro</Label>
                            <Input
                              value={addressData.bairro}
                              onChange={(e) => setAddressData((prev) => ({ ...prev, bairro: e.target.value }))}
                              placeholder="Bairro"
                              className="mt-1 bg-primary/[0.08] border-primary/30 text-white placeholder:text-white/50 focus:border-primary"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="sm:col-span-2">
                              <Label className="text-xs font-normal uppercase tracking-[0.1em] text-white/60">Cidade</Label>
                              <Input
                                value={addressData.cidade}
                                onChange={(e) => setAddressData((prev) => ({ ...prev, cidade: e.target.value }))}
                                placeholder="Cidade"
                                className="mt-1 bg-primary/[0.08] border-primary/30 text-white placeholder:text-white/50 focus:border-primary"
                              />
                            </div>
                            <div>
                              <Label className="text-xs font-normal uppercase tracking-[0.1em] text-white/60">UF</Label>
                              <Input
                                value={addressData.uf}
                                onChange={(e) => setAddressData((prev) => ({ ...prev, uf: e.target.value.toUpperCase().slice(0, 2) }))}
                                placeholder="UF"
                                maxLength={2}
                                className="mt-1 bg-primary/[0.08] border-primary/30 text-white placeholder:text-white/50 focus:border-primary uppercase"
                              />
                            </div>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )}

                {/* Step 2: Segmento — clicar num card já avança */}
                {step === 2 && (
                  <SelectableCardGrid
                    title="Qual o segmento do seu negócio?"
                    subtitle="Selecione pra personalizar sua experiência"
                    options={getSelectableSegments()}
                    selectedValue={companySegment}
                    onSelect={handleSegmentSelect}
                  />
                )}

                {/* Step 3: Origem — mesmos cards do Segmento, clicar já avança */}
                {step === 3 && (
                  <SelectableCardGrid
                    title="Como você nos conheceu?"
                    subtitle="Selecione de onde você veio"
                    options={ORIGIN_OPTIONS}
                    selectedValue={selectedOrigin}
                    onSelect={handleOriginSelect}
                  />
                )}

                {/* Step 4: Access */}
                {step === 4 && (
                  <div className="space-y-4">
                    <div className="bg-white/5 border border-white/10 p-4 rounded-lg">
                      <p className="text-sm text-white/70">
                        <strong className="text-white">Email de acesso:</strong> {emailValue}
                      </p>
                    </div>

                    <div>
                      <Label className="text-xs font-normal uppercase tracking-[0.1em] text-white/60">Senha*</Label>
                      <div className="relative mt-1">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50 z-10" />
                        <PasswordInput
                          {...register('password', { required: 'Senha é obrigatória', validate: (v) => isPasswordStrong(v) || 'Senha não atende aos requisitos mínimos' })}
                          placeholder="Crie sua senha"
                          className="pl-10 bg-primary/[0.08] border-primary/30 text-white placeholder:text-white/50 focus:border-primary"
                        />
                      </div>
                      <PasswordStrengthIndicator password={passwordValue} />
                      {errors.password && <p className="text-sm text-destructive mt-1">{errors.password.message}</p>}
                    </div>

                    <div>
                      <Label className="text-xs font-normal uppercase tracking-[0.1em] text-white/60">Confirmar Senha*</Label>
                      <div className="relative mt-1">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50 z-10" />
                        <PasswordInput
                          {...register('confirm_password', { required: 'Confirme a senha' })}
                          placeholder="Repita a senha"
                          matchAgainst={passwordValue}
                          value={confirmValue}
                          className="pl-10 bg-primary/[0.08] border-primary/30 text-white placeholder:text-white/50 focus:border-primary"
                        />
                      </div>
                      {errors.confirm_password && <p className="text-sm text-destructive mt-1">{errors.confirm_password.message}</p>}
                    </div>

                    {/* Trial info — texto simples, sem card */}
                    <div className="text-center space-y-0.5">
                      <p className="text-sm text-white/70">14 dias grátis com acesso total</p>
                      <p className="text-xs text-white/50">Sem cartão de crédito, sem compromisso</p>
                    </div>
                  </div>
                )}
                </StepTransition>

                {/* Navigation Buttons */}
                {step <= 4 && (
                  <div className="flex gap-2 pt-2">
                    {step > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handlePrevious}
                        className="gap-2 border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white hover:border-white/30 uppercase tracking-widest text-xs"
                      >
                        <ArrowLeft className="h-4 w-4" /> Voltar
                      </Button>
                    )}
                    <Button
                      type="submit"
                      className="flex-1 gap-2 uppercase tracking-widest text-sm font-semibold"
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Cadastrando...</>
                      ) : step === 4 ? (
                        'Criar Conta'
                      ) : (
                        <>Continuar <ArrowRight className="h-4 w-4" /></>
                      )}
                    </Button>
                  </div>
                )}
              </form>

              {/* Login link */}
              {step <= 4 && (
                <div className="text-center text-xs text-white/50 pt-4 border-t border-white/10 uppercase tracking-widest">
                  Já tem uma conta?{' '}
                  <Link to="/login" className="text-white font-bold hover:text-primary transition-colors">
                    Fazer login
                  </Link>
                </div>
              )}
            </div>

            {/* Rodapé com versão / Auctus / copyright dentro do sheet pra herdar safe-area padding */}
            <div className="mt-6 pt-4 border-t border-white/10">
              <SystemFooter variant="dark" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
