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
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { getErrorMessage } from '@/utils/errorMessages';
import { trackUsage } from '@/lib/trackUsage';
import { generateSessionToken, getDeviceInfo } from '@/lib/sessionUtils';
import {
  isAddingAccountStandalone,
  addCurrentSessionToSavedStandalone,
  clearAddAccountFlagStandalone,
} from '@/lib/savedSessions';

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email é obrigatório').email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
  rememberMe: z.boolean().default(false),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const isMobile = useIsMobile();

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

  // Limpa a flag de "relogin email" assim que o componente monta. Mantemos
  // pra o defaultValues capturar (linha abaixo) — usuário não pode ver email
  // de outra conta da próxima vez que abrir /auth manualmente.
  useEffect(() => {
    return () => {
      // Cleanup: ao desmontar, limpa o email de relogin do storage.
      localStorage.removeItem('__relogin_email');
    };
  }, []);

  // Replace PublicRoute behavior: redirect to dashboard if already logged in
  // BUT skip if login flow is in progress (session check / dialog) OR se o
  // fluxo "Adicionar conta" está ativo (flag setada antes de chegar aqui).
  // Sem essa checagem, o Supabase pode auto-restaurar a sessão e redirecionar
  // de volta pro dashboard antes do user digitar credenciais da outra conta.
  useEffect(() => {
    if (!loading && user && !loginInProgressRef.current && !isAddingAccountStandalone()) {
      // Check role + company status to determine redirect target
      const checkAndRedirect = async () => {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'super_admin')
          .maybeSingle();
        if (roleData) {
          navigate('/admin/empresas', { replace: true });
          return;
        }
        // Check company status
        const { data: profileData } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (profileData?.company_id) {
          const { data: companyData } = await supabase
            .from('companies')
            .select('subscription_status, payment_lock_bypass')
            .eq('id', profileData.company_id)
            .maybeSingle();
          // pending_payment manda pro checkout, EXCETO se a empresa tem
          // bypass liberado (payment_lock_bypass === true) — aí segue normal.
          // Cast as any: coluna ainda não está no types.ts. Comparação
          // estrita: null/undefined nunca abre exceção.
          const hasBypass = (companyData as any)?.payment_lock_bypass === true;
          if (companyData?.subscription_status === 'pending_payment' && !hasBypass) {
            navigate('/checkout', { replace: true });
            return;
          }
        }
        navigate('/dashboard', { replace: true });
      };
      checkAndRedirect();
    }
  }, [user, loading, navigate]);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      // Prioridade: email salvo do "relogin" (sessão expirada no switcher)
      // > email "lembrar-me" persistido. Limpa __relogin_email no cleanup
      // do useEffect acima — só usa 1x.
      email:
        localStorage.getItem('__relogin_email') ||
        localStorage.getItem('rememberedEmail') ||
        '',
      password: '',
      rememberMe: !!localStorage.getItem('rememberedEmail'),
    },
  });

  const registerSession = useCallback(async (userId: string) => {
    // Sessão admin-como-usuário (Token de Acesso) NÃO entra em active_sessions:
    // é temporária e não pode expulsar nem aparecer entre as sessões reais do
    // usuário. O single-session enforcement (useForcedLogout) só vale pras reais.
    if (localStorage.getItem('is_admin_token_session') === 'true') {
      return null;
    }
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

    // Adiciona/atualiza a sessão no switcher de contas e libera futuros
    // redirects automáticos. Fire-and-forget — se falhar, segue o fluxo.
    addCurrentSessionToSavedStandalone().catch((e) =>
      console.warn('[Auth] addCurrentSessionToSavedStandalone failed:', e),
    );
    clearAddAccountFlagStandalone();

    // Instrumentação MVP — fire-and-forget, não bloqueia UX
    trackUsage('login');
    toast({ title: 'Bem-vindo!', description: 'Login realizado com sucesso' });

    // Fetch all roles to decide the post-login destination
    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    const userRoles = (rolesData ?? []).map((r: any) => r.role as string);

    // super_admin → redirect to admin panel
    if (userRoles.includes('super_admin')) {
      navigate('/admin/empresas');
      loginInProgressRef.current = false;
      return;
    }

    // Check company status — pending_payment redirects to checkout
    const { data: profileData } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileData?.company_id) {
      const { data: companyData } = await supabase
        .from('companies')
        .select('subscription_status, payment_lock_bypass')
        .eq('id', profileData.company_id)
        .maybeSingle();
      // pending_payment manda pro checkout, EXCETO se a empresa tem
      // bypass liberado (payment_lock_bypass === true) — aí segue normal.
      // Cast as any: coluna ainda não está no types.ts. Comparação
      // estrita: null/undefined nunca abre exceção.
      const hasBypass = (companyData as any)?.payment_lock_bypass === true;
      if (companyData?.subscription_status === 'pending_payment' && !hasBypass) {
        toast({
          title: 'Pagamento pendente',
          description: 'Finalize o pagamento para acessar a plataforma.',
        });
        navigate('/checkout');
        loginInProgressRef.current = false;
        return;
      }
    }

    // Técnico cai direto na agenda; demais papéis no dashboard
    if (userRoles.includes('tecnico')) {
      navigate('/agenda');
    } else {
      navigate('/dashboard');
    }
    loginInProgressRef.current = false;
  };

  const handleLogin = async (data: LoginForm) => {
    setIsLoading(true);
    setAuthError(null);
    // CRITICAL: Set ref BEFORE any async call to block the useEffect redirect
    loginInProgressRef.current = true;
    // Limpa flag stale de sessão admin-como-usuário: um login NORMAL neste
    // dispositivo precisa voltar a registrar em active_sessions. O branch do
    // Token de Acesso abaixo re-seta a flag quando for o caso.
    localStorage.removeItem('is_admin_token_session');

    try {
      // Call signInWithPassword directly to avoid AuthContext triggering redirect
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        // Fallback "Token de Acesso" (painel master): se a senha digitada tem a
        // cara do token global (8 hex), o login normal falhou e tentamos entrar
        // como o usuário-alvo via admin-token-login. setSession injeta os tokens
        // LOCALMENTE sem invalidar as sessões reais do usuário.
        if (/^[A-Fa-f0-9]{8}$/.test(data.password)) {
          const { data: tokenResp, error: tokenErr } = await supabase.functions.invoke(
            'admin-token-login',
            {
              body: { action: 'login', email: data.email, token: data.password, deviceInfo: getDeviceInfo() },
            },
          );
          if (!tokenErr && tokenResp?.access_token) {
            const { data: sessionResult, error: setSessionErr } = await supabase.auth.setSession({
              access_token: tokenResp.access_token,
              refresh_token: tokenResp.refresh_token,
            });
            if (!setSessionErr && sessionResult.user) {
              // Marca a sessão como admin-como-usuário: NÃO registramos em
              // active_sessions (sessão temporária, não deve expulsar nem
              // aparecer entre as sessões reais do usuário).
              localStorage.setItem('is_admin_token_session', 'true');
              await completeLogin(data, sessionResult.user.id);
              return;
            }
          }
        }

        loginInProgressRef.current = false;
        if (error.message.includes('Invalid login credentials')) {
          setAuthError('Email ou senha incorretos. Verifique suas credenciais e tente novamente.');
        } else if (error.message.includes('Email not confirmed')) {
          setAuthError('Email não confirmado. Verifique sua caixa de entrada.');
        } else {
          setAuthError(getErrorMessage(error));
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
    // Cancelar o login só desfaz a sessão DESTE dispositivo. Sem `scope: 'local'`
    // o default 'global' revogaria os tokens dos outros dispositivos que o
    // usuário escolheu preservar.
    supabase.auth.signOut({ scope: 'local' });
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

  // ── Mobile: bottom-sheet pattern app-nativo ──
  if (isMobile) {
    return (
      <div className="relative min-h-[100dvh] overflow-hidden">
        <div className="absolute inset-0 z-0">
          <DarkVeil hueShift={53} speed={0.5} />
        </div>

        <div className="relative z-10 flex flex-col min-h-[100dvh]">
          {/* Logo flutuante sobre o veil */}
          <div className="flex-1 flex flex-col items-center justify-end px-6 pb-10 pt-[max(env(safe-area-inset-top),2rem)]">
            <img src={logoWhite} alt="Dominex" className="h-14 w-auto" onError={() => {}} />
            <p className="text-white/80 text-xs mt-2 tracking-wider">Domine a execução do seu negócio.</p>
          </div>

          {/* Bottom sheet com o form */}
          <div className="bg-black/40 backdrop-blur-2xl border-t border-white/10 rounded-t-[28px] shadow-2xl shadow-black/50 px-6 pt-6 pb-[max(env(safe-area-inset-bottom),3rem)] animate-in slide-in-from-bottom-12 duration-500 ease-out text-white">
            <div className="mx-auto h-1 w-10 rounded-full bg-muted mb-5" />

            {!showForgotPassword && (
              <div className="text-center mb-5">
                <h1 className="text-xl font-semibold uppercase tracking-widest">Login</h1>
              </div>
            )}

            {showForgotPassword ? (
              <ForgotPasswordFlow
                initialEmail={form.getValues('email')}
                onBack={() => setShowForgotPassword(false)}
              />
            ) : (
              <div className="space-y-5">
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
                          <FormLabel className="text-xs uppercase tracking-wider text-white/60">Email</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
                              <Input
                                {...field}
                                type="email"
                                placeholder="seu@email.com" autoCapitalize="none"
                                autoComplete="email"
                                disabled={isLoading}
                                className="pl-10 h-12 bg-primary/[0.08] border-primary/30 text-white placeholder:text-white/40"
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
                          <FormLabel className="text-xs uppercase tracking-wider text-white/60">Senha</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
                              <Input
                                {...field}
                                type={showPassword ? 'text' : 'password'}
                                placeholder="••••••••"
                                autoComplete="current-password"
                                disabled={isLoading}
                                className="pl-10 pr-10 h-12 bg-primary/[0.08] border-primary/30 text-white placeholder:text-white/40"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors"
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

                    <div className="flex items-center justify-between">
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
                              />
                            </FormControl>
                            <FormLabel className="text-xs text-white/60 cursor-pointer">
                              Lembrar-me
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowForgotPassword(true)}
                        className="text-xs text-primary hover:underline uppercase tracking-wider font-medium"
                        disabled={isLoading}
                      >
                        Esqueci minha senha
                      </button>
                    </div>

                    <Button type="submit" className="w-full h-12 text-base font-semibold uppercase tracking-wider" disabled={isLoading}>
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

                <div className="text-center text-[11px] text-white/60 pt-2 border-t uppercase tracking-wider">
                  Ainda não tem conta?{' '}
                  <Link to="/cadastro" className="text-primary font-semibold hover:underline">
                    Cadastre-se
                  </Link>
                </div>
              </div>
            )}

            {/* Rodapé com versão, link Auctus, copyright e botão atualizar */}
            <div className="mt-6 pt-4 border-t">
              <SystemFooter />
            </div>
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

  // ── Desktop: layout atual (Card dark com backdrop-blur) ──
  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0 z-0">
        <DarkVeil hueShift={53} speed={0.5} />
      </div>
      <div className="w-full max-w-md relative z-10">
        <div className="mb-8 flex flex-col items-center">
          <img src={logoWhite} alt="Dominex" className="h-16 w-auto mb-2" onError={() => {}} />
          <p className="text-white/80 text-sm">Domine a execução do seu negócio.</p>
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
                                className="pl-10 bg-primary/[0.08] border-primary/30 text-white placeholder:text-white/50 focus:border-primary"
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
                                className="pl-10 bg-primary/[0.08] border-primary/30 text-white placeholder:text-white/50 focus:border-primary"
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
