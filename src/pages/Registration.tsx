import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Check,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Phone,
  Building2,
  PartyPopper,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { phoneMask, cpfCnpjMask } from '@/utils/masks';
import { cn } from '@/lib/utils';
import logoWhite from '@/assets/logo-white.png';
import DarkVeil from '@/components/ui/DarkVeil';

// Step 1 + Step 2 combined schema
const registrationSchema = z.object({
  fullName: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  email: z.string().email('Email inválido'),
  phone: z.string().min(14, 'Telefone inválido'),
  document: z.string().optional(),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Senhas não conferem',
  path: ['confirmPassword'],
});

type RegistrationForm = z.infer<typeof registrationSchema>;

const STEP_LABELS = ['Dados', 'Acesso', 'Sucesso'];

export default function Registration() {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const { toast } = useToast();

  const form = useForm<RegistrationForm>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      document: '',
      password: '',
      confirmPassword: '',
    },
  });

  const handleNextStep = async () => {
    if (step === 1) {
      const valid = await form.trigger(['fullName', 'email', 'phone']);
      if (valid) setStep(2);
    }
  };

  const handleSubmit = async (data: RegistrationForm) => {
    if (step === 1) {
      handleNextStep();
      return;
    }
    if (step !== 2) return;

    setIsLoading(true);
    try {
      const { error } = await signUp(data.email, data.password, data.fullName);
      if (error) {
        if (error.message.includes('already registered') || error.message.includes('User already registered')) {
          toast({
            variant: 'destructive',
            title: 'Usuário já existe',
            description: 'Este email já está cadastrado. Tente fazer login.',
          });
        } else {
          toast({
            variant: 'destructive',
            title: 'Erro no cadastro',
            description: error.message,
          });
        }
        return;
      }
      setStep(3);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Ocorreu um erro inesperado',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0 z-0">
        <DarkVeil hueShift={240} speed={0.5} />
      </div>
      <div className="w-full max-w-lg relative z-10">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <img src={logoWhite} alt="Glacial Cold Brasil" className="h-16 w-auto mb-2" />
        </div>

        <Card className="border-0 bg-black/60 backdrop-blur-md shadow-2xl">
          <CardContent className="p-8">
            <div className="space-y-6">
              {/* Header */}
              <div className="text-center space-y-2">
                <h1 className="text-xl font-semibold text-white uppercase tracking-widest">
                  {step === 3 ? 'Cadastro Realizado' : 'Cadastro'}
                </h1>
                {step < 3 && (
                  <p className="text-xs text-white/60 uppercase tracking-widest">
                    Preencha seus dados para criar sua conta
                  </p>
                )}
              </div>

              {/* Step Indicators */}
              <div className="flex items-start justify-center">
                {STEP_LABELS.map((label, i) => {
                  const s = i + 1;
                  return (
                    <div key={s} className="flex items-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <div
                          className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                            s < step && 'bg-primary text-primary-foreground',
                            s === step && 'bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-transparent',
                            s > step && 'bg-white/10 text-white/40'
                          )}
                        >
                          {s < step ? <Check className="h-4 w-4" /> : s}
                        </div>
                        <span
                          className={cn(
                            'text-[10px] whitespace-nowrap uppercase tracking-widest',
                            s <= step ? 'text-primary font-medium' : 'text-white/40'
                          )}
                        >
                          {label}
                        </span>
                      </div>
                      {s < STEP_LABELS.length && (
                        <div
                          className={cn(
                            'w-10 h-0.5 mx-1 mt-4 self-start',
                            s < step ? 'bg-primary' : 'bg-white/15'
                          )}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Form */}
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  {/* Step 1: Data */}
                  {step === 1 && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                      <FormField
                        control={form.control}
                        name="fullName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-normal uppercase tracking-widest text-white/60">
                              Nome Completo*
                            </FormLabel>
                            <FormControl>
                              <div className="relative">
                                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                                <Input
                                  {...field}
                                  placeholder="Seu nome"
                                  className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-primary"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-normal uppercase tracking-widest text-white/60">
                              Email*
                            </FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                                <Input
                                  {...field}
                                  type="email"
                                  placeholder="seu@email.com"
                                  className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-primary"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-normal uppercase tracking-widest text-white/60">
                                Telefone*
                              </FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                                  <Input
                                    {...field}
                                    placeholder="(21) 98765-4321"
                                    maxLength={15}
                                    onChange={(e) => {
                                      field.onChange(phoneMask(e.target.value));
                                    }}
                                    className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-primary"
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="document"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-normal uppercase tracking-widest text-white/60">
                                CPF/CNPJ
                              </FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                                  <Input
                                    {...field}
                                    placeholder="Opcional"
                                    maxLength={18}
                                    onChange={(e) => {
                                      field.onChange(cpfCnpjMask(e.target.value));
                                    }}
                                    className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-primary"
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  )}

                  {/* Step 2: Access */}
                  {step === 2 && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                      <div className="bg-white/5 border border-white/10 p-4 rounded-lg">
                        <p className="text-sm text-white/70">
                          <strong className="text-white">Email de acesso:</strong> {form.getValues('email')}
                        </p>
                      </div>

                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-normal uppercase tracking-widest text-white/60">
                              Senha*
                            </FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                                <Input
                                  {...field}
                                  type={showPassword ? 'text' : 'password'}
                                  placeholder="Mínimo 6 caracteres"
                                  className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-primary"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPassword(!showPassword)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
                                >
                                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-normal uppercase tracking-widest text-white/60">
                              Confirmar Senha*
                            </FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                                <Input
                                  {...field}
                                  type="password"
                                  placeholder="Repita a senha"
                                  className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-primary"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {/* Step 3: Success */}
                  {step === 3 && (
                    <div className="space-y-6 text-center animate-in fade-in duration-500 py-4">
                      <div className="mx-auto w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                        <PartyPopper className="h-8 w-8 text-primary" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-lg font-semibold text-white">Conta criada com sucesso!</h3>
                        <p className="text-sm text-white/70">
                          Enviamos um email de confirmação para <strong className="text-primary">{form.getValues('email')}</strong>.
                          Verifique sua caixa de entrada para ativar sua conta.
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={() => navigate('/auth')}
                        className="uppercase tracking-widest text-sm font-semibold"
                      >
                        Ir para o Login
                      </Button>
                    </div>
                  )}

                  {/* Navigation Buttons */}
                  {step < 3 && (
                    <div className="flex gap-2 pt-2">
                      {step > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setStep(step - 1)}
                          className="gap-2 border-white/20 text-white hover:bg-white/10 uppercase tracking-widest text-xs"
                        >
                          <ArrowLeft className="h-4 w-4" />
                          Voltar
                        </Button>
                      )}
                      <Button
                        type={step === 2 ? "submit" : "button"}
                        onClick={step === 1 ? handleNextStep : undefined}
                        className="flex-1 gap-2 uppercase tracking-widest text-sm font-semibold"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Cadastrando...
                          </>
                        ) : step === 2 ? (
                          'Criar Conta'
                        ) : (
                          <>
                            Continuar
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </form>
              </Form>

              {/* Login Link */}
              {step < 3 && (
                <div className="text-center text-xs text-white/50 pt-4 border-t border-white/10 uppercase tracking-widest">
                  Já tem uma conta?{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/auth')}
                    className="text-white font-bold hover:text-primary transition-colors"
                  >
                    Fazer Login
                  </button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-[10px] text-white/40">
          © {new Date().getFullYear()} Glacial Cold Brasil. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}
