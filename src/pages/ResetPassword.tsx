import { useState, useEffect, useMemo } from 'react';
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
import { getErrorMessage } from '@/utils/errorMessages';
import { useLocale } from '@/lib/i18n';
import { localizeInternal } from '@/lib/i18n/localizeInternal';
import LanguageSelector from '@/components/i18n/LanguageSelector';

type Status = 'verifying' | 'invalid' | 'ready' | 'success';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { locale, messages } = useLocale();
  const t = messages.auth.reset;
  const [status, setStatus] = useState<Status>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const email = (searchParams.get('email') || '').trim().toLowerCase();
  const code = (searchParams.get('code') || '').replace(/\D/g, '');

  // Schema montado com as mensagens do locale (o locale de auth não muda em
  // runtime; a instância criada no primeiro render é usada pelo react-hook-form).
  const schema = useMemo(
    () =>
      z
        .object({
          password: z.string().min(8, t.errorPasswordMin).refine(isPasswordStrong, t.errorPasswordReqs),
          confirmPassword: z.string(),
        })
        .refine((d) => d.password === d.confirmPassword, {
          message: t.errorPasswordMismatch,
          path: ['confirmPassword'],
        }),
    [t],
  );

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
        setErrorMessage(t.invalidLinkMessage);
        return;
      }
      try {
        const { error, data } = await supabase.functions.invoke('reset-password-with-code', {
          body: { email, code, mode: 'verify' },
        });
        if (cancelled) return;
        if (error || (data as any)?.error) {
          // Edge function pode retornar erro em PT-BR via (data as any)?.error;
          // se vier só o error genérico do Supabase, normaliza via getErrorMessage.
          setErrorMessage((data as any)?.error || getErrorMessage(error, t.invalidCodeFallback));
          setStatus('invalid');
          return;
        }
        setStatus('ready');
      } catch (err: any) {
        if (cancelled) return;
        setErrorMessage(getErrorMessage(err, t.invalidValidateFallback));
        setStatus('invalid');
      }
    }
    verify();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, code]);

  const handleSubmit = async (data: { password: string }) => {
    setIsLoading(true);
    try {
      const { error, data: respData } = await supabase.functions.invoke('reset-password-with-code', {
        body: { email, code, newPassword: data.password },
      });
      if (error || (respData as any)?.error) {
        throw new Error((respData as any)?.error || error?.message || t.resetErrorFallback);
      }

      // Auto-login com a nova senha
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: data.password,
      });
      if (signInError) {
        // Senha foi atualizada mas auto-login falhou — manda pro login para o usuario tentar manualmente
        toast({
          title: t.toastResetTitle,
          description: t.toastResetDesc,
        });
        setTimeout(() => navigate(localizeInternal('/login', locale)), 1500);
        return;
      }

      setStatus('success');
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t.toastErrorTitle,
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

      {/* Seletor de idioma fixo no canto (via portal), preserva query. */}
      <LanguageSelector variant="corner" />

      <div className="w-full max-w-md relative z-10">
        <div className="mb-8 flex flex-col items-center">
          <img src={logoWhite} alt="Dominex" className="h-16 w-auto mb-2" />
        </div>

        <Card className="border-0 bg-black/60 backdrop-blur-md shadow-2xl">
          <CardContent className="p-8">
            {status === 'verifying' && (
              <div className="space-y-4 text-center">
                <Loader2 className="mx-auto h-8 w-8 text-primary animate-spin" />
                <p className="text-sm text-white/70">{t.verifying}</p>
              </div>
            )}

            {status === 'invalid' && (
              <div className="space-y-4 text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-destructive/20 border border-destructive/40 flex items-center justify-center">
                  <AlertCircle className="h-7 w-7 text-destructive" />
                </div>
                <h3 className="text-lg font-semibold text-white">{t.invalidTitle}</h3>
                <p className="text-sm text-white/70">{errorMessage}</p>
                <Button variant="outline" className="border-white/20 text-white hover:bg-white/10" onClick={() => navigate(localizeInternal('/login', locale))}>
                  {t.backToLogin}
                </Button>
              </div>
            )}

            {status === 'success' && (
              <div className="space-y-4 text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-primary flex items-center justify-center">
                  <CheckCircle className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white">{t.successTitle}</h3>
                <p className="text-sm text-white/70">{t.successSubtitle}</p>
              </div>
            )}

            {status === 'ready' && (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-semibold text-white uppercase tracking-widest">{t.readyTitle}</h2>
                  <p className="text-sm text-white/60">
                    {t.readySubtitlePre}<br />
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
                          <FormLabel className="text-xs font-normal uppercase tracking-widest text-white/60">{t.newPasswordLabel}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50 z-10" />
                              <PasswordInput
                                {...field}
                                placeholder={t.newPasswordPlaceholder}
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
                          <FormLabel className="text-xs font-normal uppercase tracking-widest text-white/60">{t.confirmPasswordLabel}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50 z-10" />
                              <PasswordInput
                                {...field}
                                placeholder={t.confirmPasswordPlaceholder}
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
                          {t.submitting}
                        </>
                      ) : (
                        t.submit
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
