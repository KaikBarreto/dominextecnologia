import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
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
import { trackUsage } from '@/lib/trackUsage';
import { getDeviceInfo } from '@/lib/sessionUtils';
import { registerSession, resolvePostLoginRedirect } from '@/lib/postLogin';
import {
  isAddingAccountStandalone,
  addCurrentSessionToSavedStandalone,
  clearAddAccountFlagStandalone,
} from '@/lib/savedSessions';
import { useLocale } from '@/lib/i18n';
import { localizeInternal } from '@/lib/i18n/localizeInternal';
import LanguageSelector from '@/components/i18n/LanguageSelector';
import { mapGotrueError } from '@/utils/authErrorMessages';

// Mensagens do schema vêm do i18n (montado dentro do componente via useMemo).
type LoginForm = {
  email: string;
  password: string;
  rememberMe: boolean;
};

// Logo "G" oficial multicolor do Google (lucide não tem). SVG inline pra não
// adicionar asset/rede. Mantém proporção via viewBox.
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

// Divisor "ou" entre o form de email/senha e o botão do Google. O rótulo vem
// do i18n (passado pelo chamador) pra acompanhar o idioma da tela.
function OrDivider({ label }: { label: string }) {
  return (
    <div className="relative flex items-center">
      <div className="flex-1 border-t border-white/15" />
      <span className="px-3 text-[10px] uppercase tracking-widest text-white/40">{label}</span>
      <div className="flex-1 border-t border-white/15" />
    </div>
  );
}

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

  const { user, loading, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { locale, messages } = useLocale();
  const t = messages.auth;

  // Schema montado com as mensagens do locale atual (react-hook-form usa a
  // instância criada no primeiro render; o locale de auth não muda em runtime).
  const loginSchema = useMemo(
    () =>
      z.object({
        email: z.string().trim().min(1, t.errorEmailRequired).email(t.errorEmailInvalid),
        password: z.string().min(1, t.errorPasswordRequired),
        rememberMe: z.boolean().default(false),
      }),
    [t],
  );

  // Erro vindo do retorno do Google (AuthCallback): chega via location.state
  // ({ authError }) ou query param ?auth_error=. Mostramos na montagem e
  // limpamos a URL/estado pra não reaparecer num refresh.
  useEffect(() => {
    const stateError = (location.state as { authError?: string } | null)?.authError;
    const params = new URLSearchParams(location.search);
    const queryError = params.get('auth_error');
    const incoming = stateError || queryError;
    if (incoming) {
      setAuthError(incoming);
      // Limpa state + query pra o erro não persistir em navegação/refresh.
      navigate(location.pathname, { replace: true });
    }
    // Só na montagem — não reagir a navegações internas posteriores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inicia o OAuth com Google. É um redirect (o browser sai pro Google), então
  // no sucesso não navegamos nem resetamos o loading — a página é descarregada.
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setAuthError(null);
    const { error } = await signInWithGoogle();
    if (error) {
      setAuthError(mapGotrueError(error, t.gotrueErrors));
      setIsLoading(false);
    }
  };

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

  // registerSession e a árvore de decisão de destino vivem em @/lib/postLogin
  // (fonte única compartilhada com o retorno do OAuth em AuthCallback).

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
    toast({ title: t.toastWelcomeTitle, description: t.toastWelcomeDesc });

    // Destino pós-login: árvore de decisão compartilhada (super_admin →
    // /admin/empresas; pending_payment sem bypass → /checkout; técnico →
    // /agenda; resto → /dashboard). Fonte única em @/lib/postLogin.
    const destination = await resolvePostLoginRedirect(userId);
    // Toast específico do fluxo email/senha quando cai no checkout por
    // pagamento pendente. (O OAuth não emite esse toast.)
    if (destination === '/checkout') {
      toast({
        title: t.toastPendingPaymentTitle,
        description: t.toastPendingPaymentDesc,
      });
    }
    navigate(destination);
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
        // Erros do Supabase Auth chegam em inglês → mapeados pro locale atual.
        setAuthError(mapGotrueError(error, t.gotrueErrors));
        return;
      }

      const userId = authData.user?.id;
      if (!userId) throw new Error('Authentication failed');

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
      setAuthError(t.errorUnexpected);
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
        toast({ title: t.toastOtherSessionsDisconnected });
      }

      setSessionDialogOpen(false);
      setPendingLoginData(null);
      setPendingUserId(null);
      setExistingSessionsInfo([]);
    } catch {
      setAuthError(t.errorContinueLogin);
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
    toast({ title: t.toastLoginCanceled });
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

        {/* Seletor de idioma fixo no canto (via portal), preserva query. */}
        <LanguageSelector variant="corner" />

        <div className="relative z-10 flex flex-col min-h-[100dvh]">
          {/* Logo flutuante sobre o veil */}
          <div className="flex-1 flex flex-col items-center justify-end px-6 pb-10 pt-[max(env(safe-area-inset-top),2rem)]">
            <img src={logoWhite} alt="Dominex" className="h-14 w-auto" onError={() => {}} />
            <p className="text-white/80 text-xs mt-2 tracking-wider">{t.logoTagline}</p>
          </div>

          {/* Bottom sheet com o form */}
          <div className="bg-black/40 backdrop-blur-2xl border-t border-white/10 rounded-t-[28px] shadow-2xl shadow-black/50 px-6 pt-6 pb-[max(env(safe-area-inset-bottom),3rem)] animate-in slide-in-from-bottom-12 duration-500 ease-out text-white">
            <div className="mx-auto h-1 w-10 rounded-full bg-muted mb-5" />

            {!showForgotPassword && (
              <div className="text-center mb-5">
                <h1 className="text-xl font-semibold uppercase tracking-widest">{t.loginTitle}</h1>
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
                          <FormLabel className="text-xs uppercase tracking-wider text-white/60">{t.emailLabel}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
                              <Input
                                {...field}
                                type="email"
                                placeholder={t.emailPlaceholder} autoCapitalize="none"
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
                          <FormLabel className="text-xs uppercase tracking-wider text-white/60">{t.passwordLabel}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
                              <Input
                                {...field}
                                type={showPassword ? 'text' : 'password'}
                                placeholder={t.passwordPlaceholder}
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
                              {t.rememberMe}
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
                        {t.forgotPassword}
                      </button>
                    </div>

                    <Button type="submit" className="w-full h-12 text-base font-semibold uppercase tracking-wider" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t.signingIn}
                        </>
                      ) : (
                        t.signIn
                      )}
                    </Button>
                  </form>
                </Form>

                <OrDivider label={t.orDivider} />

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="flex h-12 w-full items-center justify-center gap-3 rounded-md bg-white text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <GoogleIcon className="h-5 w-5" />
                  {t.continueWithGoogle}
                </button>

                <div className="text-center text-[11px] text-white/60 pt-2 border-t uppercase tracking-wider">
                  {t.noAccount}{' '}
                  <Link to={localizeInternal('/cadastro', locale)} className="text-primary font-semibold hover:underline">
                    {t.signUp}
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

      {/* Seletor de idioma fixo no canto (via portal), preserva query. */}
      <LanguageSelector variant="corner" />

      <div className="w-full max-w-md relative z-10">
        <div className="mb-8 flex flex-col items-center">
          <img src={logoWhite} alt="Dominex" className="h-16 w-auto mb-2" onError={() => {}} />
          <p className="text-white/80 text-sm">{t.logoTagline}</p>
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
                  <h1 className="text-xl font-semibold text-white uppercase tracking-widest">{t.loginTitle}</h1>
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
                          <FormLabel className="text-xs font-normal uppercase tracking-widest text-white/60">{t.emailLabel}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                              <Input
                                {...field}
                                type="email"
                                placeholder={t.emailPlaceholder}
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
                          <FormLabel className="text-xs font-normal uppercase tracking-widest text-white/60">{t.passwordLabel}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                              <Input
                                {...field}
                                type={showPassword ? 'text' : 'password'}
                                placeholder={t.passwordPlaceholder}
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
                              {t.rememberMe}
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
                        {t.forgotPassword}
                      </button>
                    </div>

                    <Button type="submit" className="w-full uppercase tracking-widest text-sm font-semibold" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t.signingIn}
                        </>
                      ) : (
                        t.signIn
                      )}
                    </Button>
                  </form>
                </Form>

                <OrDivider label={t.orDivider} />

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="flex h-11 w-full items-center justify-center gap-3 rounded-md bg-white text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <GoogleIcon className="h-5 w-5" />
                  {t.continueWithGoogle}
                </button>

                <div className="text-center text-xs text-white/50 pt-4 border-t border-white/10 uppercase tracking-widest">
                  {t.noAccount}{' '}
                  <Link to={localizeInternal('/cadastro', locale)} className="text-white font-bold hover:text-primary transition-colors">
                    {t.signUp}
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
