import { useState, useRef, useEffect } from 'react';
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

type Step = 'email' | 'code' | 'password' | 'done';

interface ForgotPasswordFlowProps {
  initialEmail?: string;
  onBack: () => void;
}

const emailSchema = z.object({ email: z.string().email('Email inválido') });
const passwordSchema = z.object({
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'As senhas não conferem',
  path: ['confirmPassword'],
});

const CODE_LENGTH = 8;

export function ForgotPasswordFlow({ initialEmail, onBack }: ForgotPasswordFlowProps) {
  const { toast } = useToast();
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
      toast({ title: 'Código enviado', description: 'Verifique seu email — pode levar até 1 minuto.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err?.message || 'Não foi possível enviar o código' });
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
      toast({ variant: 'destructive', title: 'Código inválido', description: err?.message || 'Verifique e tente novamente' });
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
      setStep('done');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao redefinir senha', description: err?.message || 'Tente novamente' });
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'done') {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary flex items-center justify-center">
          <CheckCircle className="h-6 w-6 text-white" />
        </div>
        <h3 className="text-lg font-semibold text-white">Senha redefinida!</h3>
        <p className="text-sm text-white/70">Você já pode entrar com a nova senha.</p>
        <Button variant="outline" onClick={onBack} className="border-white/20 text-white hover:bg-white/10">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao login
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
          <h3 className="text-lg font-semibold text-white">Nova senha</h3>
          <p className="text-sm text-white/70">Defina sua nova senha de acesso</p>
        </div>

        <Form {...passwordForm}>
          <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)} className="space-y-4">
            <FormField
              control={passwordForm.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-normal uppercase tracking-widest text-white/60">Nova senha</FormLabel>
                  <FormControl>
                    <PasswordInput
                      {...field}
                      placeholder="Mínimo 6 caracteres"
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
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
                  <FormLabel className="text-xs font-normal uppercase tracking-widest text-white/60">Confirmar senha</FormLabel>
                  <FormControl>
                    <PasswordInput
                      {...field}
                      placeholder="Repita a senha"
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Redefinindo...</> : 'Redefinir senha'}
            </Button>
          </form>
        </Form>

        <button type="button" onClick={() => setStep('code')} className="w-full text-center text-xs text-white/60 hover:text-primary uppercase tracking-widest transition-colors">
          Voltar
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
          <h3 className="text-lg font-semibold text-white">Digite o código</h3>
          <p className="text-sm text-white/70">
            Enviamos um código de {CODE_LENGTH} dígitos para<br />
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
              className="w-10 h-12 sm:w-11 sm:h-14 text-center text-lg sm:text-xl font-bold rounded-md bg-white/10 border-2 border-white/20 text-white focus:border-primary focus:outline-none focus:bg-white/15 transition-colors"
            />
          ))}
        </div>

        <Button type="button" className="w-full" onClick={verifyCode} disabled={!codeFilled || isLoading}>
          {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verificando...</> : 'Continuar'}
        </Button>

        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => requestCode(email)}
            disabled={resendCooldown > 0 || isLoading}
            className="text-white/60 hover:text-primary uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
          >
            <RotateCw className="h-3 w-3" />
            {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : 'Reenviar código'}
          </button>
          <button type="button" onClick={() => setStep('email')} className="text-white/60 hover:text-primary uppercase tracking-widest transition-colors">
            Trocar email
          </button>
        </div>
      </div>
    );
  }

  // step === 'email'
  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold text-white">Recuperar senha</h3>
        <p className="text-sm text-white/70">Informe seu email para receber o código</p>
      </div>

      <Form {...emailForm}>
        <form onSubmit={emailForm.handleSubmit(handleEmailSubmit)} className="space-y-4">
          <FormField
            control={emailForm.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-normal uppercase tracking-widest text-white/60">Email</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                    <Input
                      {...field}
                      type="email"
                      placeholder="seu@email.com"
                      className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-primary"
                      disabled={isLoading}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando...</> : 'Enviar código'}
          </Button>
        </form>
      </Form>

      <button type="button" onClick={onBack} className="w-full text-center text-xs text-white/60 hover:text-primary uppercase tracking-widest transition-colors">
        Voltar ao login
      </button>
    </div>
  );
}
