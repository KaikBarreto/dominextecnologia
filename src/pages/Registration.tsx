import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowLeft, ArrowRight, Loader2, Check,
  Phone, Mail, Building2, User, Lock,
  Globe, Instagram, Search, MessageCircle, Youtube, Users, HelpCircle,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { phoneMask } from '@/utils/masks';
import { cn } from '@/lib/utils';
import logoWhite from '@/assets/logo-horizontal-verde.png';
import DarkVeil from '@/components/ui/DarkVeil';
import { SystemFooter } from '@/components/layout/SystemFooter';
import { PasswordInput } from '@/components/PasswordInput';
import { PasswordStrengthIndicator, isPasswordStrong } from '@/components/PasswordStrengthIndicator';

const ORIGIN_ICONS: Record<string, LucideIcon> = {
  Globe, Instagram, Search, MessageCircle, Youtube, Users, HelpCircle,
  Facebook: Globe, // fallback
};

interface RegistrationFormData {
  company_name: string;
  contact_name: string;
  company_email: string;
  company_phone: string;
  company_cnpj?: string;
  password: string;
  confirm_password: string;
}

const STEP_LABELS = ['Dados', 'Origem', 'Acesso', 'Sucesso'];

export default function Registration() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [selectedOrigin, setSelectedOrigin] = useState('');

  const originFromUrl = searchParams.get('origem') || 'Site/Google';

  useEffect(() => {
    setSelectedOrigin(originFromUrl);
  }, [originFromUrl]);

  const { register, handleSubmit, watch, formState: { errors }, trigger } = useForm<RegistrationFormData>();
  const emailValue = watch('company_email');
  const passwordValue = watch('password') || '';
  const confirmValue = watch('confirm_password') || '';

  // Fetch origins
  const { data: origins = [] } = useQuery({
    queryKey: ['company-origins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_origins')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegistrationFormData) => {
      const { data: result, error } = await supabase.functions.invoke('self-register', {
        body: {
          company_name: data.company_name,
          company_cnpj: data.company_cnpj,
          company_email: data.company_email,
          company_phone: data.company_phone,
          contact_name: data.contact_name,
          password: data.password,
          origin: selectedOrigin || null,
        },
      });

      if (result?.error) throw new Error(result.error);
      if (error) {
        let msg = 'Erro ao realizar cadastro';
        try {
          const parsed = typeof (error as any)?.context?.body === 'string'
            ? JSON.parse((error as any).context.body)
            : (error as any)?.context?.body;
          if (parsed?.error) msg = parsed.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      if (!result?.success) throw new Error('Erro inesperado ao realizar cadastro');
      return result;
    },
    onSuccess: async (_, variables) => {
      toast({ title: 'Cadastro realizado!', description: 'Redirecionando...' });
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: variables.company_email,
        password: variables.password,
      });
      if (loginError) {
        navigate('/login');
      } else {
        setTimeout(() => navigate('/dashboard'), 500);
      }
    },
    onError: (error: any) => {
      const msg = error?.message || 'Erro ao realizar cadastro';
      if (msg.includes('já está cadastrado') || msg.includes('already registered')) {
        toast({ variant: 'destructive', title: 'Email já cadastrado', description: 'Faça login ou use outro email.' });
      } else {
        toast({ variant: 'destructive', title: 'Erro no cadastro', description: msg });
      }
    },
  });

  const onSubmit = async (data: RegistrationFormData) => {
    if (step === 1) {
      const valid = await trigger(['company_name', 'contact_name', 'company_email', 'company_phone']);
      if (!valid) return;
      // If origin came from URL, skip origin step
      if (originFromUrl) {
        setStep(3);
      } else {
        setStep(2);
      }
    } else if (step === 2) {
      if (!selectedOrigin) {
        toast({ variant: 'destructive', title: 'Selecione uma origem', description: 'Como você nos conheceu?' });
        return;
      }
      setStep(3);
    } else if (step === 3) {
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
    if (step === 3 && originFromUrl) setStep(1);
    else if (step > 1) setStep(step - 1);
  };

  // Dynamic step labels
  const displayLabels = originFromUrl
    ? ['Dados', 'Acesso', 'Sucesso']
    : STEP_LABELS;
  const displayStep = originFromUrl && step >= 3 ? step - 1 : step;

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-4 overflow-hidden">
      <div className="fixed inset-0 z-0">
        <DarkVeil hueShift={53} speed={0.5} />
      </div>

      <div className="relative z-10 w-full max-w-2xl">
        {/* Logo outside card */}
        <div className="mb-8 flex flex-col items-center">
          <img src={logoWhite} alt="Dominex" className="h-14 w-auto mb-2" />
          <p className="text-white/80 text-sm">Sistema de Gestão de Equipes Externas</p>
        </div>

        <Card className="border-0 sm:border sm:border-white/15 bg-black/60 sm:bg-black/40 backdrop-blur-xl shadow-2xl rounded-none sm:rounded-xl">
          <CardContent className="p-6 xl:p-8">
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

              {/* Step Indicators */}
              <div className="flex items-start justify-center">
                {displayLabels.map((label, i) => {
                  const s = i + 1;
                  return (
                    <div key={s} className="flex items-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <div className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
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
                          'w-8 h-0.5 mx-1 mt-4 self-start',
                          s < displayStep ? 'bg-primary' : 'bg-white/15'
                        )} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* Step 1: Company Data */}
                {step === 1 && (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div>
                      <Label className="text-xs font-normal uppercase tracking-[0.1em] text-white/60">Nome da Empresa*</Label>
                      <div className="relative mt-1">
                        <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                        <Input
                          {...register('company_name', { required: 'Nome da empresa é obrigatório' })}
                          placeholder="Ex: Minha Empresa Ltda"
                          className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-primary"
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
                          className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-primary"
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
                              pattern: { value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i, message: 'Email inválido' },
                            })}
                            placeholder="email@exemplo.com"
                            className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-primary"
                          />
                        </div>
                        {errors.company_email && <p className="text-sm text-destructive mt-1">{errors.company_email.message}</p>}
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
                            className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-primary"
                          />
                        </div>
                        {errors.company_phone && <p className="text-sm text-destructive mt-1">{errors.company_phone.message}</p>}
                      </div>
                    </div>

                  </div>
                )}

                {/* Step 2: Origin */}
                {step === 2 && (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <p className="text-sm text-white/60 text-center">Como você nos conheceu?</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {origins.map((o: any) => {
                        const IconComp = ORIGIN_ICONS[o.icon] || Globe;
                        const isSelected = selectedOrigin === o.name;
                        return (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => setSelectedOrigin(o.name)}
                            className={cn(
                              'flex flex-col items-center gap-2 p-4 rounded-xl border transition-all text-center',
                              isSelected
                                ? 'border-primary bg-primary/20 text-white'
                                : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30 hover:bg-white/10'
                            )}
                          >
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: isSelected ? o.color + '30' : 'rgba(255,255,255,0.1)' }}
                            >
                              <IconComp className="h-5 w-5" style={{ color: isSelected ? o.color : 'rgba(255,255,255,0.5)' }} />
                            </div>
                            <span className="text-xs font-medium">{o.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Step 3: Access */}
                {step === 3 && (
                  <div className="space-y-4 animate-in fade-in duration-300">
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
                          className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-primary"
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
                          className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-primary"
                        />
                      </div>
                      {errors.confirm_password && <p className="text-sm text-destructive mt-1">{errors.confirm_password.message}</p>}
                    </div>

                    {/* Trial info box */}
                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center">
                      <p className="text-sm text-primary font-medium">🎉 14 dias grátis com acesso total</p>
                      <p className="text-xs text-white/50 mt-1">Sem cartão de crédito, sem compromisso</p>
                    </div>
                  </div>
                )}

                {/* Navigation Buttons */}
                {step <= 3 && (
                  <div className="flex gap-2 pt-2">
                    {step > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handlePrevious}
                        className="gap-2 border-white/20 text-white hover:bg-white/20 bg-white/10 uppercase tracking-widest text-xs"
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
                      ) : step === 3 ? (
                        'Criar Conta'
                      ) : (
                        <>Continuar <ArrowRight className="h-4 w-4" /></>
                      )}
                    </Button>
                  </div>
                )}
              </form>

              {/* Login link */}
              {step <= 3 && (
                <div className="text-center text-xs text-white/50 pt-4 border-t border-white/10 uppercase tracking-widest">
                  Já tem uma conta?{' '}
                  <Link to="/login" className="text-white font-bold hover:text-primary transition-colors">
                    Fazer login
                  </Link>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="mt-8">
          <SystemFooter variant="dark" />
        </div>
      </div>
    </div>
  );
}
