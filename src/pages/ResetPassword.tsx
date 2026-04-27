import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import logoWhite from '@/assets/logo-white.png';
import DarkVeil from '@/components/ui/DarkVeil';
import { SystemFooter } from '@/components/layout/SystemFooter';
import { PasswordInput } from '@/components/PasswordInput';
import { PasswordStrengthIndicator, isPasswordStrong } from '@/components/PasswordStrengthIndicator';
import { getFriendlyPasswordError } from '@/utils/passwordHelpers';

const schema = z.object({
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres').refine(isPasswordStrong, 'Senha não atende aos requisitos mínimos'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Senhas não conferem',
  path: ['confirmPassword'],
});

type Status = 'verifying' | 'invalid' | 'ready' | 'success';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const email = (searchParams.get('email') || '').trim().toLowerCase();
  const code = (searchParams.get('code') || '').replace(/\D/g, '');

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const passwordValue = form.watch('password') || '';

  // Verifica o código na montagem
  useEffect(() => {
    let cancelled = false;
    async function verify() {
      if (!email || !code) {
        setStatus('invalid');
        setErrorMessage('Link inválido. Solicite uma nova recuperação no login.');
        return;
      }
      try {
        const { error, data } = await supabase.functions.invoke('reset-password-with-code', {
          body: { email, code, mode: 'verify' },
        });
        if (cancelled) return;
        if (error || (data as any)?.error) {
          setErrorMessage((data as any)?.error || error?.message || 'Código inválido ou expirado');
          setStatus('invalid');
          return;
        }
        setStatus('ready');
      } catch (err: any) {
        if (cancelled) return;
        setErrorMessage(err?.message || 'Falha ao validar código');
        setStatus('invalid');
      }
    }
    verify();
    return () => { cancelled = true; };
  }, [email, code]);

  const handleSubmit = async (data: { password: string }) => {
    setIsLoading(true);
    try {
      const { error, data: respData } = await supabase.functions.invoke('reset-password-with-code', {
        body: { email, code, newPassword: data.password },
      });
      if (error || (respData as any)?.error) {
        throw new Error((respData as any)?.error || error?.message || 'Erro ao redefinir senha');
      }

      // Auto-login com a nova senha
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: data.password,
      });
      if (signInError) {
        // Senha foi atualizada mas auto-login falhou — manda pro login para o usuario tentar manualmente
        toast({
          title: 'Senha redefinida',
          description: 'Faça login com a nova senha.',
        });
        setTimeout(() => navigate('/login'), 1500);
        return;
      }

      setStatus('success');
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: getFriendlyPasswordError(error),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0 z-0">
        <DarkVeil hueShift={53} speed={0.5} />
      </div>
      <div className="w-full max-w-md relative z-10">
        <div className="mb-8 flex flex-col items-center">
          <img src={logoWhite} alt="Dominex" className="h-16 w-auto mb-2" />
        </div>

        <Card className="border-0 bg-black/60 backdrop-blur-md shadow-2xl">
          <CardContent className="p-8">
            {status === 'verifying' && (
              <div className="space-y-4 text-center">
                <Loader2 className="mx-auto h-8 w-8 text-primary animate-spin" />
                <p className="text-sm text-white/70">Validando seu link de recuperação…</p>
              </div>
            )}

            {status === 'invalid' && (
              <div className="space-y-4 text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-destructive/20 border border-destructive/40 flex items-center justify-center">
                  <AlertCircle className="h-7 w-7 text-destructive" />
                </div>
                <h3 className="text-lg font-semibold text-white">Link inválido</h3>
                <p className="text-sm text-white/70">{errorMessage}</p>
                <Button variant="outline" className="border-white/20 text-white hover:bg-white/10" onClick={() => navigate('/login')}>
                  Voltar ao login
                </Button>
              </div>
            )}

            {status === 'success' && (
              <div className="space-y-4 text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-primary flex items-center justify-center">
                  <CheckCircle className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white">Senha redefinida!</h3>
                <p className="text-sm text-white/70">Entrando no sistema…</p>
              </div>
            )}

            {status === 'ready' && (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-semibold text-white uppercase tracking-widest">Nova Senha</h2>
                  <p className="text-sm text-white/60">
                    Recuperação validada para<br />
                    <span className="text-white font-medium">{email}</span>
                  </p>
                </div>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-normal uppercase tracking-widest text-white/60">Nova Senha</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50 z-10" />
                              <PasswordInput
                                {...field}
                                placeholder="Crie uma senha segura"
                                className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-primary"
                              />
                            </div>
                          </FormControl>
                          <PasswordStrengthIndicator password={passwordValue} />
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-normal uppercase tracking-widest text-white/60">Confirmar Senha</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50 z-10" />
                              <PasswordInput
                                {...field}
                                placeholder="Repita a senha"
                                matchAgainst={passwordValue}
                                className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-primary"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Redefinindo...
                        </>
                      ) : (
                        'REDEFINIR SENHA'
                      )}
                    </Button>
                  </form>
                </Form>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6">
          <SystemFooter variant="dark" />
        </div>
      </div>
    </div>
  );
}
