import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2, Mail, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { ForgotPasswordFlow } from '@/components/auth/ForgotPasswordFlow';
import { SessionConfirmDialog } from '@/components/SessionConfirmDialog';
import logoWhite from '@/assets/logo-horizontal-verde.png';
import DarkVeil from '@/components/ui/DarkVeil';
import { SystemFooter } from '@/components/layout/SystemFooter';
import { supabase } from '@/integrations/supabase/client';

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email é obrigatório').email('Email inválido'),
  password: z.string().min(10, 'Senha deve ter no mínimo 10 caracteres'),
  rememberMe: z.boolean().default(false),
});

type LoginForm = z.infer<typeof loginSchema>;

const generateSessionToken = () => crypto.randomUUID();

const getDeviceInfo = () => {
  const ua = navigator.userAgent;
  const isMobile = /Mobile|Android|iPhone|iPad/.test(ua);
  const browser = /Chrome/.test(ua) ? "Chrome" : /Firefox/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "Outro";
  return `${isMobile ? "Mobile" : "Desktop"} - ${browser}`;
};

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Session management state
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [existingSessionsInfo, setExistingSessionsInfo] = useState<{ device_info: string | null; last_activity: string }[]>([]);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [pendingLoginData, setPendingLoginData] = useState<LoginForm | null>(null);
  const [disconnectOthers, setDisconnectOthers] = useState(false);

  // Ref to prevent auto-redirect while login flow is in progress
  const loginInProgressRef = useRef(false);

  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Replace PublicRoute behavior: redirect to dashboard if already logged in
  // BUT skip if login flow is in progress (session check / dialog)
  useEffect(() => {
    if (!loading && user && !loginInProgressRef.current) {
      // Check if super_admin → redirect to admin dashboard
      const checkRole = async () => {
        const { data } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'super_admin')
          .maybeSingle();
        if (data) {
          navigate('/admin/dashboard', { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      };
      checkRole();
    }
  }, [user, loading, navigate]);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: localStorage.getItem('rememberedEmail') || '',
      password: '',
      rememberMe: !!localStorage.getItem('rememberedEmail'),
    },
  });

  const registerSession = useCallback(async (userId: string) => {
    const sessionToken = generateSessionToken();
    await supabase
      .from('active_sessions')
      .insert({
        user_id: userId,
        session_token: sessionToken,
        device_info: getDeviceInfo(),
        last_activity: new Date().toISOString(),
      });
    localStorage.setItem("session_token", sessionToken);
    return sessionToken;
  }, []);

  const disconnectOtherSessions = useCallback(async (userId: string) => {
    const currentToken = localStorage.getItem("session_token");
    if (!currentToken) return;
    await supabase
      .from('active_sessions')
      .delete()
      .eq("user_id", userId)
      .neq("session_token", currentToken);
  }, []);

  const completeLogin = async (data: LoginForm, userId: string) => {
    if (data.rememberMe) {
      localStorage.setItem('rememberedEmail', data.email);
    } else {
      localStorage.removeItem('rememberedEmail');
    }
    await registerSession(userId);
    toast({ title: 'Bem-vindo!', description: 'Login realizado com sucesso' });
    
    // Check if super_admin → redirect to admin dashboard
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'super_admin')
      .maybeSingle();
    
    navigate(roleData ? '/admin/dashboard' : '/dashboard');
    loginInProgressRef.current = false;
  };

  const handleLogin = async (data: LoginForm) => {
    setIsLoading(true);
    setAuthError(null);
    // CRITICAL: Set ref BEFORE any async call to block the useEffect redirect
    loginInProgressRef.current = true;

    try {
      // Call signInWithPassword directly to avoid AuthContext triggering redirect
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        loginInProgressRef.current = false;
        if (error.message.includes('Invalid login credentials')) {
          setAuthError('Email ou senha incorretos. Verifique suas credenciais e tente novamente.');
        } else if (error.message.includes('Email not confirmed')) {
          setAuthError('Email não confirmado. Verifique sua caixa de entrada.');
        } else {
          setAuthError(error.message);
        }
        return;
      }

      const userId = authData.user?.id;
      if (!userId) throw new Error('Falha na autenticação');

      // Check for existing active sessions from OTHER devices
      const currentToken = localStorage.getItem("session_token");
      const { data: otherSessions } = await supabase
        .from('active_sessions')
        .select("device_info, last_activity, session_token")
        .eq("user_id", userId)
        .neq("session_token", currentToken || "___none___");

      // Filter recent sessions (active within last 60 min)
      const recentSessions = (otherSessions || []).filter((s) => {
        const diff = (Date.now() - new Date(s.last_activity!).getTime()) / 60000;
        return diff < 60;
      });

      if (recentSessions.length > 0) {
        // Show session dialog — keep loginInProgressRef true to block redirect
        setPendingUserId(userId);
        setPendingLoginData(data);
        setExistingSessionsInfo(recentSessions.map((s: any) => ({ device_info: s.device_info, last_activity: s.last_activity })));
        setDisconnectOthers(false);
        setSessionDialogOpen(true);
        setIsLoading(false);
        return; // loginInProgressRef stays true — blocks useEffect redirect
      }

      // No other sessions - login directly
      await completeLogin(data, userId);
    } catch {
      loginInProgressRef.current = false;
      setAuthError('Ocorreu um erro inesperado. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSessionContinue = async () => {
    if (!pendingLoginData || !pendingUserId) return;
    setIsLoading(true);
    try {
      await completeLogin(pendingLoginData, pendingUserId);

      if (disconnectOthers) {
        await disconnectOtherSessions(pendingUserId);
        toast({ title: 'Outras sessões desconectadas' });
      }

      setSessionDialogOpen(false);
      setPendingLoginData(null);
      setPendingUserId(null);
      setExistingSessionsInfo([]);
    } catch {
      setAuthError('Erro ao continuar login.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSessionCancel = () => {
    setSessionDialogOpen(false);
    setPendingLoginData(null);
    setPendingUserId(null);
    setExistingSessionsInfo([]);
    loginInProgressRef.current = false;
    supabase.auth.signOut();
    toast({ title: 'Login cancelado' });
  };

  // Show skeleton while auth state is loading
  if (loading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden">
        <div className="absolute inset-0 z-0 bg-[hsl(0,0%,4%)]" />
        <div className="w-full max-w-md relative z-10">
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="h-14 w-48 rounded-lg bg-white/10 animate-pulse" />
            <div className="h-4 w-64 rounded bg-white/10 animate-pulse" />
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-8 space-y-6">
            <div className="h-6 w-20 mx-auto rounded bg-white/10 animate-pulse" />
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="h-3 w-16 rounded bg-white/10 animate-pulse" />
                <div className="h-10 w-full rounded-md bg-white/10 animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-16 rounded bg-white/10 animate-pulse" />
                <div className="h-10 w-full rounded-md bg-white/10 animate-pulse" />
              </div>
              <div className="h-10 w-full rounded-md bg-white/10 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0 z-0">
        <DarkVeil hueShift={53} speed={0.5} />
      </div>
      <div className="w-full max-w-md relative z-10">
        <div className="mb-8 flex flex-col items-center">
          <img src={logoWhite} alt="Dominex" className="h-16 w-auto mb-2" onError={() => {}} />
          <p className="text-white/80 text-sm">Sistema de Gestão de Equipes Externas</p>
        </div>

        <Card className="border-0 bg-black/60 backdrop-blur-md shadow-2xl">
          <CardContent className="p-8">
            {showForgotPassword ? (
              <ForgotPasswordFlow
                initialEmail={form.getValues('email')}
                onBack={() => setShowForgotPassword(false)}
              />
            ) : (
              <div className="space-y-6">
                <div className="text-center">
                  <h1 className="text-xl font-semibold text-white uppercase tracking-widest">Login</h1>
                </div>

                {authError && (
                  <Alert variant="destructive">
                    <AlertDescription>{authError}</AlertDescription>
                  </Alert>
                )}

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-4" autoComplete="on">
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
                                autoComplete="email"
                                autoFocus
                                disabled={isLoading}
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
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-normal uppercase tracking-widest text-white/60">Senha</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                              <Input
                                {...field}
                                type={showPassword ? 'text' : 'password'}
                                placeholder="••••••••"
                                autoComplete="current-password"
                                disabled={isLoading}
                                className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-primary"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
                                disabled={isLoading}
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex flex-col gap-3">
                      <FormField
                        control={form.control}
                        name="rememberMe"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={isLoading}
                                className="border-white/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                              />
                            </FormControl>
                            <FormLabel className="text-xs font-normal uppercase tracking-widest text-white/60 cursor-pointer">
                              Lembrar-me
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowForgotPassword(true)}
                        className="text-xs text-white/60 hover:text-primary uppercase tracking-widest transition-colors text-left"
                        disabled={isLoading}
                      >
                        Esqueci minha senha
                      </button>
                    </div>

                    <Button type="submit" className="w-full uppercase tracking-widest text-sm font-semibold" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Entrando...
                        </>
                      ) : (
                        'Entrar'
                      )}
                    </Button>
                  </form>
                </Form>

                <div className="text-center text-xs text-white/50 pt-4 border-t border-white/10 uppercase tracking-widest">
                  Ainda não tem conta?{' '}
                  <Link to="/cadastro" className="text-white font-bold hover:text-primary transition-colors">
                    Cadastre-se
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6">
          <SystemFooter variant="dark" />
        </div>
      </div>

      <SessionConfirmDialog
        open={sessionDialogOpen}
        onOpenChange={setSessionDialogOpen}
        existingSessions={existingSessionsInfo}
        disconnectOthers={disconnectOthers}
        onDisconnectOthersChange={setDisconnectOthers}
        onConfirm={handleSessionContinue}
        onCancel={handleSessionCancel}
        isLoading={isLoading}
      />
    </div>
  );
}
