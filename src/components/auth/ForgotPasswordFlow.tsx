import { useState, useRef, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Loader2, Mail, KeyRound, Lock, CheckCircle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PasswordInput } from '@/components/PasswordInput';
import { PasswordStrengthIndicator } from '@/components/PasswordStrengthIndicator';
import { getErrorMessage } from '@/utils/errorMessages';
import { StepTransition } from '@/components/ui/step-transition';
import { useLocale } from '@/lib/i18n';

type Step = 'email' | 'code' | 'password' | 'done';

interface ForgotPasswordFlowProps {
  initialEmail?: string;
  onBack: () => void;
}

const CODE_LENGTH = 8;

export function ForgotPasswordFlow({ initialEmail, onBack }: ForgotPasswordFlowProps) {
  const { toast } = useToast();
  const { messages } = useLocale();
  const t = messages.auth.forgot;

  // Schemas montados com as mensagens do locale (o locale de auth não muda em
  // runtime; a instância criada no primeiro render é usada pelo react-hook-form).
  const emailSchema = useMemo(
    () => z.object({ email: z.string().email(t.errorEmailInvalid) }),
    [t],
  );
  const passwordSchema = useMemo(
    () =>
      z
        .object({
          password: z.string().min(6, t.errorPasswordMin),
          confirmPassword: z.string(),
        })
        .refine((d) => d.password === d.confirmPassword, {
          message: t.errorPasswordMismatch,
          path: ['confirmPassword'],
        }),
    [t],
  );

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(initialEmail ?? '');
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeInputs = useRef<(HTMLInputElement | null)[]>([]);

  const emailForm = useForm({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: initialEmail ?? '' },
  });

  const passwordForm = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  // Cooldown para reenvio
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const requestCode = async (targetEmail: string) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke('request-password-reset', {
        body: { email: targetEmail },
      });
      if (error) throw error;
      setEmail(targetEmail);
      setStep('code');
      setResendCooldown(60);
      setCode(Array(CODE_LENGTH).fill(''));
      toast({ title: t.toastCodeSentTitle, description: t.toastCodeSentDesc });
    } catch (err: any) {
      toast({ variant: 'destructive', title: t.toastErrorTitle, description: getErrorMessage(err, t.toastSendCodeFallback) });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSubmit = (data: { email: string }) => requestCode(data.email.trim().toLowerCase());

  const handleCodeChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    if (digit && index < CODE_LENGTH - 1) {
      codeInputs.current[index + 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!pasted) return;
    const arr = pasted.split('').concat(Array(CODE_LENGTH - pasted.length).fill(''));
    setCode(arr);
    const lastIdx = Math.min(pasted.length, CODE_LENGTH - 1);
    codeInputs.current[lastIdx]?.focus();
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      codeInputs.current[index - 1]?.focus();
    }
  };

  const verifyCode = async () => {
    const codeStr = code.join('');
    if (codeStr.length !== CODE_LENGTH) return;
    setIsLoading(true);
    try {
      const { error, data } = await supabase.functions.invoke('reset-password-with-code', {
        body: { email, code: codeStr, mode: 'verify' },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      setStep('password');
    } catch (err: any) {
      toast({ variant: 'destructive', title: t.toastInvalidCodeTitle, description: getErrorMessage(err, t.toastInvalidCodeFallback) });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (data: { password: string; confirmPassword: string }) => {
    setIsLoading(true);
    try {
      const codeStr = code.join('');
      const { error, data: respData } = await supabase.functions.invoke('reset-password-with-code', {
        body: { email, code: codeStr, newPassword: data.password },
      });
      if (error || (respData as any)?.error) throw new Error((respData as any)?.error || error?.message);

      // Auto-login com a nova senha
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: data.password,
      });
      if (signInError) {
        // Senha foi atualizada mas auto-login falhou — fluxo manual
        setStep('done');
        return;
      }

      // Sessao criada — o AuthContext detecta e redireciona automaticamente
      setStep('done');
    } catch (err: any) {
      toast({ variant: 'destructive', title: t.toastResetErrorTitle, description: getErrorMessage(err, t.toastResetFallback) });
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepContent = () => {
    if (step === 'done') {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary flex items-center justify-center">
          <CheckCircle className="h-6 w-6 text-white" />
        </div>
        <h3 className="text-lg font-semibold text-white">{t.doneTitle}</h3>
        <p className="text-sm text-white/60">{t.doneSubtitle}</p>
        <Button variant="outline" onClick={onBack} className="border-white/20 text-white hover:bg-background">
          <ArrowLeft className="mr-2 h-4 w-4" /> {t.backToLogin}
        </Button>
      </div>
    );
  }

  if (step === 'password') {
    return (
      <div className="space-y-4">
        <div className="text-center space-y-2">
          <div className="mx-auto w-10 h-10 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
            <Lock className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-white">{t.passwordStepTitle}</h3>
          <p className="text-sm text-white/60">{t.passwordStepSubtitle}</p>
        </div>

        <Form {...passwordForm}>
          <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)} className="space-y-4">
            <FormField
              control={passwordForm.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-normal uppercase tracking-widest text-white/60">{t.newPasswordLabel}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      {...field}
                      placeholder={t.newPasswordPlaceholder}
                      className="bg-primary/[0.08] border-primary/30 text-white placeholder:text-white/40"
                      disabled={isLoading}
                    />
                  </FormControl>
                  <PasswordStrengthIndicator password={field.value} />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={passwordForm.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-normal uppercase tracking-widest text-white/60">{t.confirmPasswordLabel}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      {...field}
                      placeholder={t.confirmPasswordPlaceholder}
                      className="bg-primary/[0.08] border-primary/30 text-white placeholder:text-white/40"
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t.submitting}</> : t.submit}
            </Button>
          </form>
        </Form>

        <button type="button" onClick={() => setStep('code')} className="w-full text-center text-xs text-white/60 hover:text-primary uppercase tracking-widest transition-colors">
          {t.back}
        </button>
      </div>
    );
  }

  if (step === 'code') {
    const codeFilled = code.every((d) => d.length === 1);
    return (
      <div className="space-y-4">
        <div className="text-center space-y-2">
          <div className="mx-auto w-10 h-10 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
            <KeyRound className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-white">{t.codeStepTitle}</h3>
          <p className="text-sm text-white/60">
            {t.codeStepSubtitle(String(CODE_LENGTH))}<br />
            <span className="font-medium text-white">{email}</span>
          </p>
        </div>

        <div className="flex justify-center gap-1.5" onPaste={handleCodePaste}>
          {code.map((digit, i) => (
            <input
              key={i}
              ref={(el) => (codeInputs.current[i] = el)}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              value={digit}
              onChange={(e) => handleCodeChange(i, e.target.value)}
              onKeyDown={(e) => handleCodeKeyDown(i, e)}
              disabled={isLoading}
              className="w-10 h-12 sm:w-11 sm:h-14 text-center text-lg sm:text-xl font-bold rounded-md bg-white/10 border-2 border-white/20 text-white focus:border-primary focus:outline-none focus:bg-white/10 transition-colors"
            />
          ))}
        </div>

        <Button type="button" className="w-full" onClick={verifyCode} disabled={!codeFilled || isLoading}>
          {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t.verifying}</> : t.verifyContinue}
        </Button>

        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => requestCode(email)}
            disabled={resendCooldown > 0 || isLoading}
            className="text-white/60 hover:text-primary uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
          >
            <RotateCw className="h-3 w-3" />
            {resendCooldown > 0 ? t.resendIn(String(resendCooldown)) : t.resendCode}
          </button>
          <button type="button" onClick={() => setStep('email')} className="text-white/60 hover:text-primary uppercase tracking-widest transition-colors">
            {t.changeEmail}
          </button>
        </div>
      </div>
    );
  }

  // step === 'email'
  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold text-white">{t.emailStepTitle}</h3>
        <p className="text-sm text-white/60">{t.emailStepSubtitle}</p>
      </div>

      <Form {...emailForm}>
        <form onSubmit={emailForm.handleSubmit(handleEmailSubmit)} className="space-y-4">
          <FormField
            control={emailForm.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-normal uppercase tracking-widest text-white/60">{t.emailLabel}</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
                    <Input
                      {...field}
                      type="email"
                      placeholder={t.emailPlaceholder}
                      className="pl-10 bg-primary/[0.08] border-primary/30 text-white placeholder:text-white/40 focus:border-primary"
                      disabled={isLoading}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t.sending}</> : t.sendCode}
          </Button>
        </form>
      </Form>

      <button type="button" onClick={onBack} className="w-full text-center text-xs text-white/60 hover:text-primary uppercase tracking-widest transition-colors">
        {t.backToLogin}
      </button>
    </div>
    );
  };

  return (
    <StepTransition stepKey={step} index={['email', 'code', 'password', 'done'].indexOf(step)}>
      {renderStepContent()}
    </StepTransition>
  );
}
