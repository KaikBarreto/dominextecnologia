import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Loader2, Mail, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const schema = z.object({
  email: z.string().email('Email inválido'),
});

interface ForgotPasswordFlowProps {
  initialEmail?: string;
  onBack: () => void;
}

export function ForgotPasswordFlow({ initialEmail, onBack }: ForgotPasswordFlowProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: initialEmail || '' },
  });

  const handleSubmit = async (data: { email: string }) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Erro ao enviar email de recuperação',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
          <CheckCircle className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-white">Email enviado!</h3>
        <p className="text-sm text-white/70">
          Verifique sua caixa de entrada e siga as instruções para redefinir sua senha.
        </p>
        <Button variant="outline" onClick={onBack} className="border-white/20 text-white hover:bg-white/10">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar ao login
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold text-white">Recuperar senha</h3>
        <p className="text-sm text-white/70">
          Informe seu email para receber o link de recuperação
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField
            control={form.control}
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
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              'Enviar link de recuperação'
            )}
          </Button>
        </form>
      </Form>

      <button
        type="button"
        onClick={onBack}
        className="w-full text-center text-xs text-white/60 hover:text-primary uppercase tracking-widest transition-colors"
      >
        Voltar ao login
      </button>
    </div>
  );
}
